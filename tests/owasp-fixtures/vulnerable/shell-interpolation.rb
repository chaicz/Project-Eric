class ReportsController < ApplicationController
  def show
    # A03: the shell command is built from a request parameter.
    output = `ls -l #{params[:dir]}`
    render plain: output
  end
end
